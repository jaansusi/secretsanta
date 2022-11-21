﻿// <auto-generated />
using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SecretSanta;

#nullable disable

namespace SecretSanta.Migrations
{
    [DbContext(typeof(SantaContext))]
    [Migration("20211118090059_AddIvToSanta")]
    partial class AddIvToSanta
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder.HasAnnotation("ProductVersion", "6.0.0");

            modelBuilder.Entity("SecretSanta.Models.Santa", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("TEXT");

                    b.Property<string>("DesignatedPerson")
                        .IsRequired()
                        .HasColumnType("TEXT");

                    b.Property<string>("IVBase64")
                        .IsRequired()
                        .HasColumnType("TEXT");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasColumnType("TEXT");

                    b.HasKey("Id");

                    b.ToTable("Santas");
                });
#pragma warning restore 612, 618
        }
    }
}